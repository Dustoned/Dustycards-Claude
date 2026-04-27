import { NextRequest, NextResponse } from "next/server";
import { importPullRateData } from "@/lib/pull-rates";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let content = "";
    let source: string | null = null;

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        content?: unknown;
        source?: unknown;
      };
      content = typeof body.content === "string" ? body.content : "";
      source = typeof body.source === "string" ? body.source : null;
    } else {
      content = await req.text();
    }

    const result = await importPullRateData({ content, source });

    return NextResponse.json({
      ok: result.setsImported > 0,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
