import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import {
  parseCardMarketScrape,
  parseStrictCardMarketEnglishNmPrice,
} from "@/lib/card-submissions";
import {
  buildCardMarketProductUrl,
  getSafeDirectCardMarketCardUrl,
} from "@/lib/cardmarket";
import { normalizeTradingCardGame } from "@/lib/games";
import { scrapePageWithFallback } from "@/lib/scrape-provider";

const CHECK_TOKEN_VERSION = 1;
const CHECK_TOKEN_TTL_MS = 10 * 60_000;

type CardMarketCheckTokenPayload = {
  v: typeof CHECK_TOKEN_VERSION;
  cardId: string;
  priceEur: number;
  offerCount: number;
  sourceUrl: string;
  provider: string;
  observedAt: string;
};

export type AdminCardMarketPriceCheck = {
  cardId: string;
  cardName: string;
  currentPriceEur: number | null;
  observedPriceEur: number;
  differenceEur: number | null;
  differencePercent: number | null;
  offerCount: number;
  sourceUrl: string;
  provider: string;
  observedAt: string;
  scrapedName: string | null;
  scrapedSetName: string | null;
  scrapedCardNumber: string | null;
  token: string;
};

export class AdminCardMarketPriceCheckError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminCardMarketPriceCheckError";
    this.status = status;
  }
}

function getTokenSecret(): string {
  const secret =
    process.env.DUSTYCARDS_SYNC_SCHEDULER_SECRET?.trim() ||
    process.env.FIRECRAWL_API_KEY?.trim() ||
    process.env.FIRECRAWL_API_KEY_SECOND?.trim() ||
    process.env.FIRECRAWL_API_KEYS?.trim() ||
    process.env.SCRAPEDO_API_KEY?.trim();
  if (!secret) {
    throw new AdminCardMarketPriceCheckError(
      "The live CardMarket check is not configured on this server.",
      503
    );
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getTokenSecret()).update(encodedPayload).digest("base64url");
}

export function createAdminCardMarketPriceCheckToken(
  payload: CardMarketCheckTokenPayload
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function parseAdminCardMarketPriceCheckToken(
  token: string,
  expectedCardId: string,
  now = new Date()
): CardMarketCheckTokenPayload {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    throw new AdminCardMarketPriceCheckError("This live price check is invalid. Run it again.");
  }
  const expectedSignature = signPayload(encodedPayload);
  const received = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AdminCardMarketPriceCheckError("This live price check is invalid. Run it again.");
  }

  let payload: CardMarketCheckTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CardMarketCheckTokenPayload;
  } catch {
    throw new AdminCardMarketPriceCheckError("This live price check is invalid. Run it again.");
  }

  const observedAt = new Date(payload.observedAt);
  if (
    payload.v !== CHECK_TOKEN_VERSION ||
    payload.cardId !== expectedCardId ||
    !Number.isFinite(payload.priceEur) ||
    payload.priceEur <= 0 ||
    !Number.isFinite(observedAt.getTime()) ||
    now.getTime() - observedAt.getTime() > CHECK_TOKEN_TTL_MS ||
    observedAt.getTime() - now.getTime() > 60_000
  ) {
    throw new AdminCardMarketPriceCheckError("This live price check expired. Run it again.");
  }
  return payload;
}

export async function runAdminCardMarketPriceCheck(
  cardId: string
): Promise<AdminCardMarketPriceCheck> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      game: true,
      name: true,
      cardmarket_id: true,
      cardmarket_url: true,
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
        take: 1,
        select: { cm_en_lowest_nm: true },
      },
    },
  });
  if (!card) throw new AdminCardMarketPriceCheckError("Card not found.", 404);

  const game = normalizeTradingCardGame(card.game);
  const sourceUrl =
    getSafeDirectCardMarketCardUrl(card.cardmarket_url, game) ??
    (card.cardmarket_id ? buildCardMarketProductUrl(card.cardmarket_id, game) : null);
  if (!sourceUrl) {
    throw new AdminCardMarketPriceCheckError(
      "This card has no direct CardMarket product linked yet.",
      409
    );
  }

  let scrape;
  try {
    scrape = await scrapePageWithFallback(sourceUrl);
  } catch (error) {
    throw new AdminCardMarketPriceCheckError(
      `CardMarket could not be checked: ${error instanceof Error ? error.message : String(error)}`,
      502
    );
  }

  const strictPrice = parseStrictCardMarketEnglishNmPrice(scrape);
  if (!strictPrice) {
    throw new AdminCardMarketPriceCheckError(
      "CardMarket returned no explicit English Near Mint offers for this card.",
      422
    );
  }

  const parsed = parseCardMarketScrape(scrape, "Near Mint");
  const observedAt = new Date();
  const currentPriceEur = card.prices[0]?.cm_en_lowest_nm ?? null;
  const differenceEur = currentPriceEur == null
    ? null
    : Number((strictPrice.priceEur - currentPriceEur).toFixed(2));
  const differencePercent =
    currentPriceEur != null && currentPriceEur > 0
      ? Number((((strictPrice.priceEur - currentPriceEur) / currentPriceEur) * 100).toFixed(1))
      : null;
  const tokenPayload: CardMarketCheckTokenPayload = {
    v: CHECK_TOKEN_VERSION,
    cardId,
    priceEur: strictPrice.priceEur,
    offerCount: strictPrice.offerCount,
    sourceUrl: scrape.sourceUrl,
    provider: scrape.provider,
    observedAt: observedAt.toISOString(),
  };

  return {
    cardId,
    cardName: card.name,
    currentPriceEur,
    observedPriceEur: strictPrice.priceEur,
    differenceEur,
    differencePercent,
    offerCount: strictPrice.offerCount,
    sourceUrl: scrape.sourceUrl,
    provider: scrape.provider,
    observedAt: observedAt.toISOString(),
    scrapedName: parsed.name,
    scrapedSetName: parsed.setName,
    scrapedCardNumber: parsed.cardNumber,
    token: createAdminCardMarketPriceCheckToken(tokenPayload),
  };
}

export async function confirmAdminCardMarketPriceCheck(input: {
  cardId: string;
  token: string;
  decision: "changed" | "unchanged";
}): Promise<{ savedPrice: boolean; checkedAt: string }> {
  const now = new Date();
  const payload = parseAdminCardMarketPriceCheckToken(input.token, input.cardId, now);

  await db.$transaction(async (tx) => {
    const card = await tx.card.findUnique({
      where: { id: input.cardId },
      select: {
        id: true,
        prices: {
          where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
          orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
          take: 1,
          select: { cm_en_lowest_nm: true, changed_at: true },
        },
      },
    });
    if (!card) throw new AdminCardMarketPriceCheckError("Card not found.", 404);

    if (input.decision === "changed") {
      const previous = card.prices[0] ?? null;
      const actuallyChanged =
        previous?.cm_en_lowest_nm == null ||
        Math.abs(previous.cm_en_lowest_nm - payload.priceEur) >= 0.005;
      await tx.price.create({
        data: {
          card_id: input.cardId,
          fetched_at: now,
          changed_at: actuallyChanged ? now : previous?.changed_at ?? now,
          source: "cardmarket_admin_live",
          source_provider: payload.provider,
          source_url: payload.sourceUrl,
          cm_en_lowest_nm: payload.priceEur,
        },
      });
    }

    await tx.card.update({
      where: { id: input.cardId },
      data: { price_source_checked_at: now, price_source_status: null },
    });
  });

  return { savedPrice: input.decision === "changed", checkedAt: now.toISOString() };
}
