import { NextResponse } from "next/server";
import { appBuildLabel, appVersion, buildVersion, serverStartedAtIso } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { version: appVersion, build: buildVersion, buildLabel: appBuildLabel, startedAt: serverStartedAtIso },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Expires: "0",
        Pragma: "no-cache",
      },
    }
  );
}
