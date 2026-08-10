import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getCardDetailPayload,
  getCardRelatedPrintingsPayload,
} from "@/lib/card-detail-data";
import {
  runCardPriceRefresh,
  runSingleCardHistoryImport,
  SyncCancelledError,
  SyncConflictError,
} from "@/lib/sync";
import { isTcggoQuotaExceededError } from "@/lib/tcggo";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import {
  CardSubmissionError,
} from "@/lib/card-submissions";
import {
  getSubmittedCardRefreshJobSnapshot,
  startSubmittedCardRefreshJob,
  type SubmittedCardRefreshJobSnapshot,
} from "@/lib/sync/submitted-card-refresh-job";

type CardAction = "refresh" | "sync-history";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (req.nextUrl.searchParams.get("refreshStatus") === "1") {
      const refreshJob = await getSubmittedCardRefreshJobSnapshot(id);
      return NextResponse.json(
        { refreshJob },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (req.nextUrl.searchParams.get("relatedPrintings") === "1") {
      const relatedPrintingsPayload = await getCardRelatedPrintingsPayload(id);
      if (!relatedPrintingsPayload) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(relatedPrintingsPayload, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const payload = await getCardDetailPayload(id, user.id);

    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Failed to load card" }, { status: 500 });
  }
}

async function refreshCardPrices(
  cardId: string
): Promise<SubmittedCardRefreshJobSnapshot | null> {
  const refreshTarget = await db.card.findUnique({
    where: { id: cardId },
    select: {
      is_user_submitted: true,
      cardSubmissions: {
        where: { status: "added" },
        orderBy: { updated_at: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!refreshTarget?.is_user_submitted) {
    await runCardPriceRefresh(cardId);
    return null;
  }

  const submissionId = refreshTarget.cardSubmissions[0]?.id;
  if (!submissionId) {
    throw new CardSubmissionError(
      "This submitted card no longer has an active CardMarket refresh source.",
      409
    );
  }

  return startSubmittedCardRefreshJob(cardId, submissionId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;
    const scraperDisabled = getScraperDisabledResponse(req);
    if (scraperDisabled) return scraperDisabled;

    let action: CardAction = "refresh";

    try {
      const body = (await req.json()) as { action?: CardAction };
      if (body.action === "sync-history") {
        action = "sync-history";
      }
    } catch {
      // Empty or invalid JSON should behave like a regular refresh.
    }

    if (action === "sync-history") {
      await runSingleCardHistoryImport(id);
    } else {
      const refreshJob = await refreshCardPrices(id);
      if (refreshJob) {
        return NextResponse.json(
          { refreshPending: true, refreshJob },
          { status: 202 }
        );
      }
    }

    const payload = await getCardDetailPayload(id, user.id);

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

    if (error instanceof CardSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[cards/:id refresh]", error);
    return NextResponse.json({ error: "Could not refresh card prices" }, { status: 500 });
  }
}
