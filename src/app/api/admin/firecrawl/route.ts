import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  getFirecrawlConfigSnapshot,
  scrapeFirecrawlUrl,
  searchFirecrawlDocs,
  toFirecrawlApiError,
} from "@/lib/firecrawl";

type FirecrawlAction = "docs-search" | "scrape";

function normalizeAction(value: unknown): FirecrawlAction | null {
  return value === "docs-search" || value === "scrape" ? value : null;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, config: getFirecrawlConfigSnapshot() });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ ok: false, error: "Could not load Firecrawl status." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      question?: unknown;
      url?: unknown;
    };
    const action = normalizeAction(body.action);

    if (!action) {
      return NextResponse.json({ ok: false, error: "Unknown Firecrawl action." }, { status: 400 });
    }

    if (action === "docs-search") {
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (question.length < 8) {
        return NextResponse.json({ ok: false, error: "Ask a slightly more specific question." }, { status: 400 });
      }
      if (question.length > 800) {
        return NextResponse.json({ ok: false, error: "Keep the docs question under 800 characters." }, { status: 400 });
      }

      const result = await searchFirecrawlDocs(question);
      return NextResponse.json({ ok: true, result });
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    const result = await scrapeFirecrawlUrl(url);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const apiError = toFirecrawlApiError(error);
    return NextResponse.json({ ok: false, error: apiError.message }, { status: apiError.status });
  }
}
