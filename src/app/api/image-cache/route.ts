import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  ensureImageCached,
  parseCacheableImageUrl,
} from "@/lib/image-cache-server";

export const dynamic = "force-dynamic";

function imageHeaders(contentType: string, cacheState: "HIT" | "MISS"): HeadersInit {
  return {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": contentType,
    "X-DustyCards-Image-Cache": cacheState,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  const sourceUrl = parseCacheableImageUrl(request.nextUrl.searchParams.get("url"));
  if (!sourceUrl) {
    return NextResponse.json({ error: "Unsupported image URL" }, { status: 400 });
  }

  try {
    const result = await ensureImageCached(sourceUrl);
    if (result.hit) {
      const stream = Readable.toWeb(createReadStream(result.imagePath)) as ReadableStream<Uint8Array>;
      return new NextResponse(stream, { headers: imageHeaders(result.contentType, "HIT") });
    }

    const bytes = new Uint8Array(result.buffer ?? Buffer.alloc(0));
    return new NextResponse(bytes, { headers: imageHeaders(result.contentType, "MISS") });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
