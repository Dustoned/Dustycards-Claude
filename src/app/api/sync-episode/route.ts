import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { runEpisodeSync } from "@/lib/sync";
import { getScraperDisabledResponse } from "@/app/api/scraper-disabled-response";
import { getSyncErrorResponse } from "@/app/api/sync-error-response";

export async function POST(request: NextRequest) {
  const scraperDisabled = getScraperDisabledResponse();
  if (scraperDisabled) return scraperDisabled;

  try {
    await requireAdmin();
    const { episodeId } = await request.json();
    if (!episodeId) {
      return NextResponse.json({ ok: false, error: "episodeId required" }, { status: 400 });
    }

    const result = await runEpisodeSync(String(episodeId));
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return getSyncErrorResponse(error);
  }
}
