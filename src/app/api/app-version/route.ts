import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serverStartedAt = new Date().toISOString();
const appVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ??
  process.env.APP_VERSION ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  serverStartedAt;

export function GET() {
  return NextResponse.json(
    { version: appVersion },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Expires: "0",
        Pragma: "no-cache",
      },
    }
  );
}
