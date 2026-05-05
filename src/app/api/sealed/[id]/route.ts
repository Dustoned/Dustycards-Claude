import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildSealedPriceHistory } from "@/lib/price-history";
import { getSealedPriceSnapshotsByProduct } from "@/lib/sealed-price-snapshots";
import {
  runSealedProductHistorySync,
  runSealedProductRefresh,
  SyncCancelledError,
  SyncConflictError,
} from "@/lib/sync";
import { resolveCardMarketSealedProductUrl } from "@/lib/cardmarket";
import { isTcggoQuotaExceededError } from "@/lib/tcggo";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";

type SealedAction = "refresh" | "sync-history";

async function getSealedDetailPayload(id: string) {
  const product = await db.sealedProduct.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      image_url: true,
      tcggo_url: true,
      cardmarket_url: true,
      cardmarket_id: true,
      cm_lowest: true,
      cm_lowest_eu: true,
      cm_lowest_de: true,
      cm_lowest_fr: true,
      cm_lowest_es: true,
      cm_lowest_it: true,
      cm_avg_7d: true,
      cm_avg_30d: true,
      synced_at: true,
      native_history_synced_at: true,
      episode: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const snapshots = await getSealedPriceSnapshotsByProduct(id);

  return {
    id: product.id,
    name: product.name,
    image_url: product.image_url,
    tcggo_url: product.tcggo_url,
    cardmarket_id: product.cardmarket_id,
    cardmarket_url: resolveCardMarketSealedProductUrl(product),
    price_fetched_at: product.synced_at ? product.synced_at.toISOString() : null,
    history_synced_at: product.native_history_synced_at
      ? product.native_history_synced_at.toISOString()
      : null,
    price: {
      cm_lowest: product.cm_lowest,
      cm_lowest_eu: product.cm_lowest_eu,
      cm_lowest_de: product.cm_lowest_de,
      cm_lowest_fr: product.cm_lowest_fr,
      cm_lowest_es: product.cm_lowest_es,
      cm_lowest_it: product.cm_lowest_it,
      cm_avg_7d: product.cm_avg_7d,
      cm_avg_30d: product.cm_avg_30d,
    },
    price_history: buildSealedPriceHistory(snapshots),
    episode: product.episode,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const payload = await getSealedDetailPayload(id);

    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to load sealed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const scraperDisabled = getScraperDisabledResponse();
    if (scraperDisabled) return scraperDisabled;

    let action: SealedAction = "refresh";

    try {
      const body = (await req.json()) as { action?: SealedAction };
      if (body.action === "sync-history") {
        action = "sync-history";
      }
    } catch {
      // Treat empty or invalid JSON bodies as a regular refresh request.
    }

    if (action === "sync-history") {
      await runSealedProductHistorySync(id);
    } else {
      await runSealedProductRefresh(id);
    }

    const payload = await getSealedDetailPayload(id);

    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SyncCancelledError) {
      return NextResponse.json(
        {
          error: error.message,
          cancelled: true,
        },
        { status: 409 }
      );
    }

    if (error instanceof SyncConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          activeType: error.activeType,
          startedAt: error.startedAt.toISOString(),
        },
        { status: 409 }
      );
    }

    if (isTcggoQuotaExceededError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          resetAt: error.resetAt ? error.resetAt.toISOString() : null,
        },
        { status: 429 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return authErrorResponse(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
