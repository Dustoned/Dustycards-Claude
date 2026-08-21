import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  ensureResponsiveImageCached,
  parseCacheableImageUrl,
  parseImageCacheVariant,
} from "@/lib/image-cache-server";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function imageHeaders(contentType: string, cacheState: "HIT" | "MISS"): HeadersInit {
  return {
    "Cache-Control": "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-DustyCards-Image-Cache": cacheState,
  };
}

export async function GET(request: NextRequest) {
  if (consumeRateLimit(`image-cache:${getClientIp(request)}`, 240, 60_000)) {
    return NextResponse.json(
      { error: "Too many image requests" },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  const sourceUrl = parseCacheableImageUrl(request.nextUrl.searchParams.get("url"));
  if (!sourceUrl) {
    return NextResponse.json({ error: "Unsupported image URL" }, { status: 400 });
  }
  const variant = parseImageCacheVariant(sourceUrl, request.nextUrl.searchParams.get("variant"));
  const width = request.nextUrl.searchParams.get("width");

  try {
    const result = await ensureResponsiveImageCached(sourceUrl, { variant, width });
    if (result.hit) {
      const stream = Readable.toWeb(
        createReadStream(/*turbopackIgnore: true*/ result.imagePath)
      ) as ReadableStream<Uint8Array>;
      return new NextResponse(stream, { headers: imageHeaders(result.contentType, "HIT") });
    }

    const bytes = new Uint8Array(result.buffer ?? Buffer.alloc(0));
    return new NextResponse(bytes, { headers: imageHeaders(result.contentType, "MISS") });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[image-cache] fetch failed", message);
    return NextResponse.json(
      { error: "Image could not be loaded" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
