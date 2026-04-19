import { NextRequest, NextResponse } from "next/server";
import { buildSealedPriceHistory } from "@/lib/price-history";
import { getSealedPriceSnapshotsByProduct } from "@/lib/sealed-price-snapshots";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const snapshots = await getSealedPriceSnapshotsByProduct(id);

  return NextResponse.json({
    price_history: buildSealedPriceHistory(snapshots),
  });
}
