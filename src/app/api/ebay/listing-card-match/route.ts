import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type OverrideStatus = "confirmed" | "ignored";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStatus(value: unknown): OverrideStatus | null {
  return value === "confirmed" || value === "ignored" ? value : null;
}

async function parseBody(req: NextRequest) {
  return (await req.json().catch(() => ({}))) as {
    marketplaceId?: unknown;
    itemId?: unknown;
    cardId?: unknown;
    status?: unknown;
    title?: unknown;
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req);
    const marketplaceId = normalizeText(body.marketplaceId);
    const itemId = normalizeText(body.itemId);
    const cardId = normalizeText(body.cardId);
    const status = parseStatus(body.status);
    const title = normalizeText(body.title);

    if (!marketplaceId || !itemId || !status) {
      return NextResponse.json({ error: "Missing marketplaceId, itemId or status" }, { status: 400 });
    }

    if (status === "confirmed") {
      if (!cardId) {
        return NextResponse.json({ error: "cardId is required for confirmed matches" }, { status: 400 });
      }

      const card = await db.card.findUnique({ where: { id: cardId }, select: { id: true } });
      if (!card) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
      }
    }

    const override = await db.ebayListingCardOverride.upsert({
      where: {
        user_id_marketplace_id_item_id: {
          user_id: user.id,
          marketplace_id: marketplaceId,
          item_id: itemId,
        },
      },
      create: {
        user_id: user.id,
        marketplace_id: marketplaceId,
        item_id: itemId,
        status,
        card_id: status === "confirmed" ? cardId : null,
        title_snapshot: title || null,
      },
      update: {
        status,
        card_id: status === "confirmed" ? cardId : null,
        title_snapshot: title || null,
      },
      select: {
        id: true,
        marketplace_id: true,
        item_id: true,
        card_id: true,
        status: true,
        updated_at: true,
      },
    });

    return NextResponse.json({ ok: true, override });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseBody(req);
    const marketplaceId =
      normalizeText(body.marketplaceId) || normalizeText(req.nextUrl.searchParams.get("marketplaceId"));
    const itemId = normalizeText(body.itemId) || normalizeText(req.nextUrl.searchParams.get("itemId"));

    if (!marketplaceId || !itemId) {
      return NextResponse.json({ error: "Missing marketplaceId or itemId" }, { status: 400 });
    }

    await db.ebayListingCardOverride.deleteMany({
      where: {
        user_id: user.id,
        marketplace_id: marketplaceId,
        item_id: itemId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
