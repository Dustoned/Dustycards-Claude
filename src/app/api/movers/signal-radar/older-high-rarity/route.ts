import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getCardQuickActionMap } from "@/lib/card-quick-actions-server";
import { compressedJsonResponse } from "@/lib/compressed-json-response";
import { getOlderHighRarityValueSignals } from "@/lib/older-high-rarity-value-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const signals = await getOlderHighRarityValueSignals();
    const cardQuickActions = await getCardQuickActionMap(
      user.id,
      signals.map((signal) => signal.cardId)
    );

    return compressedJsonResponse(
      request,
      {
        signals,
        cardQuickActions,
        total: signals.length,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
          Vary: "Cookie",
        },
      }
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { error: "Failed to load old high-rarity value cards" },
        { status: 500 }
      )
    );
  }
}
