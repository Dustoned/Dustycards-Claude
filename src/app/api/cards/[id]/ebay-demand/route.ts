import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getEbayDemandPayload,
  getLatestEbayDemandListingPage,
  type EbayDemandMode,
} from "@/lib/ebay-demand";
import { getEbayDemandRuntimeConfig } from "@/lib/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMode(value: string | null): EbayDemandMode {
  return value === "graded" ? "graded" : "raw";
}

function parseInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), maximum);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const card = await db.card.findUnique({ where: { id }, select: { id: true } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const mode = parseMode(request.nextUrl.searchParams.get("mode"));
    const runtimeConfig = getEbayDemandRuntimeConfig();
    const requestedMarketplace = request.nextUrl.searchParams.get("marketplaceId")?.trim();
    const marketplaceId = requestedMarketplace || runtimeConfig.marketplaceId;
    const listingLimit = Math.max(1, parseInteger(request.nextUrl.searchParams.get("listingLimit"), 12, 100));
    const listingOffset = parseInteger(request.nextUrl.searchParams.get("listingOffset"), 0, 10_000);
    const [demand, listingPage] = await Promise.all([
      getEbayDemandPayload({ cardId: id, marketplaceId, mode }),
      getLatestEbayDemandListingPage({
        cardId: id,
        marketplaceId,
        mode,
        limit: listingLimit,
        offset: listingOffset,
      }),
    ]);

    return NextResponse.json(
      {
        hasData: demand != null,
        demand,
        listings: listingPage.listings,
        listingPage: {
          total: listingPage.total,
          offset: listingPage.offset,
          limit: listingPage.limit,
          hasMore: listingPage.hasMore,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("[ebay-demand]", error);
    return NextResponse.json({ error: "Could not load eBay demand data" }, { status: 500 });
  }
}
