import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WATCHED_LISTINGS = 200;

export interface WatchedListingPayload {
  id: string;
  marketplaceId: string;
  itemId: string;
  title: string;
  itemWebUrl: string;
  imageUrl: string | null;
  cardId: string | null;
  sealedProductId: string | null;
  mode: string;
  priceEur: number | null;
  referenceEur: number | null;
  discountPercent: number | null;
  sellerUsername: string | null;
  itemEndDate: string | null;
  createdAt: string;
}

type WatchedListingRecord = NonNullable<
  Awaited<ReturnType<typeof db.ebayWatchedListing.findFirst>>
>;

function toPayload(record: WatchedListingRecord): WatchedListingPayload {
  return {
    id: record.id,
    marketplaceId: record.marketplace_id,
    itemId: record.item_id,
    title: record.title,
    itemWebUrl: record.item_web_url,
    imageUrl: record.image_url,
    cardId: record.card_id,
    sealedProductId: record.sealed_product_id,
    mode: record.mode,
    priceEur: record.price_eur,
    referenceEur: record.reference_eur,
    discountPercent: record.discount_percent,
    sellerUsername: record.seller_username,
    itemEndDate: record.item_end_date?.toISOString() ?? null,
    createdAt: record.created_at.toISOString(),
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const records = await db.ebayWatchedListing.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: "desc" },
      take: MAX_WATCHED_LISTINGS,
    });

    return NextResponse.json({ ok: true, listings: records.map(toPayload) });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[ebay/watched-listings GET]", error);
    return NextResponse.json({ error: "Could not load watched listings" }, { status: 500 });
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const marketplaceId = readString(body.marketplaceId);
    const itemId = readString(body.itemId);
    const title = readString(body.title);
    const itemWebUrl = readString(body.itemWebUrl);

    if (!marketplaceId || !itemId || !title || !itemWebUrl || !isHttpUrl(itemWebUrl)) {
      return NextResponse.json(
        { error: "marketplaceId, itemId, title, and a valid itemWebUrl are required" },
        { status: 400 }
      );
    }

    const watchedCount = await db.ebayWatchedListing.count({ where: { user_id: user.id } });
    if (watchedCount >= MAX_WATCHED_LISTINGS) {
      return NextResponse.json(
        { error: `Watch list is full (max ${MAX_WATCHED_LISTINGS} listings)` },
        { status: 400 }
      );
    }

    const imageUrl = readString(body.imageUrl);
    const endDateRaw = readString(body.itemEndDate);
    const endDate = endDateRaw ? new Date(endDateRaw) : null;
    const data = {
      title,
      item_web_url: itemWebUrl,
      image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
      card_id: readString(body.cardId),
      sealed_product_id: readString(body.sealedProductId),
      mode: readString(body.mode) ?? "raw",
      price_eur: readNumber(body.priceEur),
      reference_eur: readNumber(body.referenceEur),
      discount_percent: readNumber(body.discountPercent),
      seller_username: readString(body.sellerUsername),
      item_end_date: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
    };

    const record = await db.ebayWatchedListing.upsert({
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
        ...data,
      },
      update: data,
    });

    return NextResponse.json({ ok: true, listing: toPayload(record) });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[ebay/watched-listings POST]", error);
    return NextResponse.json({ error: "Could not save listing" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const marketplaceId = readString(body.marketplaceId);
    const itemId = readString(body.itemId);

    if (!marketplaceId || !itemId) {
      return NextResponse.json(
        { error: "marketplaceId and itemId are required" },
        { status: 400 }
      );
    }

    await db.ebayWatchedListing.deleteMany({
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

    console.error("[ebay/watched-listings DELETE]", error);
    return NextResponse.json({ error: "Could not remove listing" }, { status: 500 });
  }
}
